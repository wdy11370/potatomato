"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CircleStop,
  FileText,
  Loader2,
  Mic,
  Play,
  RefreshCcw,
  Send,
  Volume2
} from "lucide-react";
import { getScenario, scenarioIconMap, scenarios, ScenarioId } from "@/lib/scenarios";
import type { Feedback, Report, Turn } from "@/lib/mockCoach";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const makeTurn = (speaker: Turn["speaker"], text: string): Turn => ({
  id: crypto.randomUUID(),
  speaker,
  text,
  createdAt: new Date().toISOString()
});

export default function Home() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("interview");
  const scenario = useMemo(() => getScenario(scenarioId), [scenarioId]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [pronunciationNote, setPronunciationNote] = useState("");
  const [connectionMode, setConnectionMode] = useState("演示模式");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const latestAudioRef = useRef<Blob | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    setTurns([makeTurn("ai", scenario.firstLine)]);
    setFeedback(null);
    setReport(null);
    setDraft("");
    setPronunciationNote("");
  }, [scenario]);

  async function probeRealtime() {
    const response = await fetch("/api/realtime/session", { method: "POST" });
    const data = await response.json();
    setConnectionMode(data.mode === "realtime" ? "Realtime 已配置" : "演示模式");
  }

  useEffect(() => {
    probeRealtime().catch(() => setConnectionMode("演示模式"));
  }, []);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.96;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function startAudioCapture() {
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunksRef.current = [];
    latestAudioRef.current = null;
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      latestAudioRef.current = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      stream.getTracks().forEach((track) => track.stop());
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
  }

  async function startListening() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setPronunciationNote("当前浏览器不支持 Web Speech API，请直接输入英文回答。");
      return;
    }

    try {
      await startAudioCapture();
    } catch {
      setPronunciationNote("无法录制音频，发音评测会暂时使用文本演示评分。");
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setDraft((finalText || interimText).trim());
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setPronunciationNote("语音识别失败，请检查麦克风权限后重试。");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setIsListening(false);
  }

  async function requestFeedback(text: string) {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = (await response.json()) as Feedback;
    setFeedback(data);
  }

  async function requestPronunciation(text: string) {
    const form = new FormData();
    form.append("text", text);
    if (latestAudioRef.current) form.append("audio", latestAudioRef.current, "answer.webm");
    const response = await fetch("/api/pronunciation", { method: "POST", body: form });
    const data = await response.json();
    setPronunciationNote(data.note ?? `Pronunciation score: ${data.pronScore ?? "--"}`);
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isThinking) return;

    const userTurn = makeTurn("user", text);
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setDraft("");
    setFeedback(null);
    setIsThinking(true);

    await Promise.all([requestFeedback(text), requestPronunciation(text)]);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId, turns: nextTurns })
    });
    const data = await response.json();
    const aiTurn = makeTurn("ai", data.text);
    setTurns((current) => [...current, aiTurn]);
    setIsThinking(false);
    speak(data.text);
  }

  async function finishSession() {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns })
    });
    const data = (await response.json()) as Report;
    setReport(data);
  }

  function resetSession() {
    setTurns([makeTurn("ai", scenario.firstLine)]);
    setFeedback(null);
    setReport(null);
    setDraft("");
    setPronunciationNote("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/potatomato-logo.png" alt="potatomato" />
          <span>Potatomato Speaking Coach</span>
        </div>
        <div className="status-pill">
          <Bot size={15} />
          {connectionMode} · {scenario.role}
        </div>
      </header>

      <section className="main-grid">
        <aside className="panel">
          <div className="panel-header">
            <h1 className="panel-title">训练场景</h1>
            <p className="panel-subtitle">选择角色、难度和本轮口语目标。</p>
          </div>
          <div className="panel-body">
            <div className="scenario-list">
              {scenarios.map((item) => {
                const Icon = scenarioIconMap[item.id];
                return (
                  <button
                    key={item.id}
                    className={`scenario-button ${scenarioId === item.id ? "active" : ""}`}
                    onClick={() => setScenarioId(item.id)}
                    type="button"
                  >
                    <span className="scenario-name">
                      <Icon size={18} />
                      {item.name}
                    </span>
                    <span className="scenario-meta">
                      {item.level} · {item.objective}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="report">
              <div className="feedback-label">本轮达标点</div>
              <div className="feedback-list">
                {scenario.successCriteria.map((criterion) => (
                  <div className="small-note" key={criterion}>
                    {criterion}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="panel chat-panel">
          <div className="panel-header">
            <h2 className="panel-title">{scenario.name}</h2>
            <p className="panel-subtitle">{scenario.objective}</p>
            <div className="controls">
              <button className="secondary-button" onClick={() => speak(turns.at(-1)?.text ?? scenario.firstLine)} type="button">
                <Volume2 size={17} />
                播放
              </button>
              <button className="secondary-button" onClick={finishSession} type="button">
                <FileText size={17} />
                生成报告
              </button>
              <button className="secondary-button" onClick={resetSession} type="button">
                <RefreshCcw size={17} />
                重开
              </button>
            </div>
          </div>

          <div className="chat-log">
            {turns.map((turn) => (
              <article className={`turn ${turn.speaker}`} key={turn.id}>
                <div className="turn-role">{turn.speaker === "ai" ? scenario.role : "你"}</div>
                <div className="turn-text">{turn.text}</div>
              </article>
            ))}
            {isThinking ? (
              <article className="turn ai">
                <div className="turn-role">{scenario.role}</div>
                <div className="turn-text">
                  <Loader2 size={16} className="spin" /> Thinking...
                </div>
              </article>
            ) : null}
            <div ref={chatEndRef} />
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <div className="small-note">
              用麦克风说英文，或直接输入英文回答。首次使用语音时浏览器会请求麦克风权限。
            </div>
            <div className="input-row">
              <input
                className="text-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Speak or type your English response..."
              />
              <button
                className="icon-button"
                onClick={isListening ? stopListening : startListening}
                title={isListening ? "停止录音" : "开始录音"}
                type="button"
              >
                {isListening ? <CircleStop size={18} /> : <Mic size={18} />}
                {isListening ? "停止" : "录音"}
              </button>
              <button className="primary-button" disabled={!draft.trim() || isThinking} type="submit">
                {isThinking ? <Loader2 size={18} /> : <Send size={18} />}
                发送
              </button>
            </div>
          </form>
        </section>

        <aside className="panel right-panel">
          <div className="panel-header">
            <h2 className="panel-title">反馈与报告</h2>
            <p className="panel-subtitle">对话中轻纠错，课后集中给训练建议。</p>
          </div>
          <div className="panel-body">
            <div className="feedback-list">
              <div className="feedback-item">
                <div className="feedback-label">即时表达纠错</div>
                {feedback ? (
                  <>
                    <div className="turn-text">{feedback.corrected}</div>
                    <p className="small-note">{feedback.issue}</p>
                    <p className="small-note">{feedback.better}</p>
                  </>
                ) : (
                  <div className="small-note">发送第一句话后显示建议。</div>
                )}
              </div>

              <div className="feedback-item">
                <div className="feedback-label">发音评测接口</div>
                <div className="small-note">{pronunciationNote || "等待用户回答。配置 Azure 后可输出音素级评分。"}</div>
              </div>
            </div>

            {report ? (
              <section className="report">
                <div className="score-grid">
                  <Score label="总分" value={report.overall} />
                  <Score label="任务完成" value={report.taskCompletion} />
                  <Score label="流利度" value={report.fluency} />
                  <Score label="语法" value={report.grammar} />
                  <Score label="词汇" value={report.vocabulary} />
                  <Score label="发音" value={report.pronunciation} />
                </div>
                <ReportBlock title="优势" items={report.strengths} />
                <ReportBlock title="重点问题" items={report.issues} />
                <ReportBlock title="下次训练" items={report.drills} />
              </section>
            ) : (
              <section className="report">
                <button className="primary-button" onClick={finishSession} type="button">
                  <Play size={17} />
                  结束并生成报告
                </button>
              </section>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-card">
      <div className="score-value">{value}</div>
      <div className="score-label">{label}</div>
      <div className="meter" style={{ "--value": `${value}%` } as React.CSSProperties}>
        <span />
      </div>
    </div>
  );
}

function ReportBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="feedback-item" style={{ marginTop: 12 }}>
      <div className="feedback-label">{title}</div>
      {items.map((item) => (
        <p className="small-note" key={item}>
          {item}
        </p>
      ))}
    </div>
  );
}
