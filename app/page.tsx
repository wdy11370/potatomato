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

type TraceEvent = {
  id: string;
  step: string;
  status: "success" | "fallback" | "skipped" | "error";
  startedAt: string;
  durationMs: number;
  provider?: string;
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
};

type AgentTurnResponse = {
  sessionId: string;
  aiTurn: Turn;
  updatedTurns: Turn[];
  feedback: Feedback;
  pronunciation?: {
    note: string;
    pronScore?: number | null;
  };
  stateSummary: {
    validUserTurns: number;
    invalidUserTurns: number;
    averageWordsPerUserTurn: number;
    repeatedIssues: string[];
  };
  trace?: TraceEvent[];
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
  const [isReporting, setIsReporting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [pronunciationNote, setPronunciationNote] = useState("");
  const [connectionMode, setConnectionMode] = useState("演示模式");
  const [sessionId, setSessionId] = useState("");
  const [showTrace, setShowTrace] = useState(false);
  const [agentTrace, setAgentTrace] = useState<TraceEvent[]>([]);
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
    setReportError("");
    setDraft("");
    setPronunciationNote("");
    setSessionId("");
    setAgentTrace([]);
    setShowTrace(false);
    latestAudioRef.current = null;
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

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isThinking) return;

    const userTurn = makeTurn("user", text);
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setDraft("");
    setFeedback(null);
    setReportError("");
    setIsThinking(true);
    setAgentTrace([]);

    try {
      const form = new FormData();
      if (sessionId) form.append("sessionId", sessionId);
      form.append("scenarioId", scenarioId);
      form.append("turns", JSON.stringify(nextTurns));
      form.append("text", text);
      form.append("includeTrace", "true");
      if (latestAudioRef.current) form.append("audio", latestAudioRef.current, "answer.webm");
      latestAudioRef.current = null;

      const response = await fetch("/api/agent/turn", { method: "POST", body: form });
      if (!response.ok) throw new Error("Agent turn failed.");
      const data = (await response.json()) as AgentTurnResponse;

      setSessionId(data.sessionId);
      setFeedback(data.feedback);
      setPronunciationNote(data.pronunciation?.note ?? `Pronunciation score: ${data.pronunciation?.pronScore ?? "--"}`);
      setAgentTrace(data.trace ?? []);
      setTurns(data.updatedTurns ?? [...nextTurns, data.aiTurn]);
      setIsThinking(false);
      speak(data.aiTurn.text);
      return;
    } catch {
      setFeedback({
        corrected: text,
        issue: "Agent feedback is temporarily unavailable.",
        better: "Please try again later or continue the conversation.",
        pronunciationHint: "Pronunciation assessment can be retried later."
      });
      setPronunciationNote("Agent API is temporarily unavailable. Please try again.");
      setIsThinking(false);
      return;
    }

  }

  async function finishSession() {
    if (isReporting) return;

    setIsReporting(true);
    setReportError("");

    try {
      const response = await fetch("/api/agent/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, scenarioId, turns, includeTrace: true })
      });
      if (!response.ok) throw new Error("Agent report failed.");

      const data = (await response.json()) as { report: Report; trace?: TraceEvent[] };
      setReport(data.report);
      if (data.trace) setAgentTrace(data.trace);
    } catch {
      setReportError("Agent report is temporarily unavailable. Please try again.");
    } finally {
      setIsReporting(false);
    }
  }

  function resetSession() {
    setTurns([makeTurn("ai", scenario.firstLine)]);
    setFeedback(null);
    setReport(null);
    setReportError("");
    setDraft("");
    setPronunciationNote("");
    setSessionId("");
    setAgentTrace([]);
    setShowTrace(false);
    latestAudioRef.current = null;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <img className="brand-logo" src="/potatomato-icon.png" alt="potatomato" />
          </span>
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
              <button className="secondary-button" disabled={isReporting} onClick={finishSession} type="button">
                {isReporting ? <Loader2 size={17} className="spin" /> : <FileText size={17} />}
                {isReporting ? "生成中" : "生成报告"}
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
              <div className="feedback-item trace-card">
                <button className="trace-toggle" onClick={() => setShowTrace((current) => !current)} type="button">
                  Agent Trace
                  <span>{showTrace ? "Hide" : "Show"}</span>
                </button>
                {showTrace ? (
                  <div className="trace-list">
                    {agentTrace.length ? (
                      agentTrace.map((event) => (
                        <div className={`trace-row ${event.status}`} key={event.id}>
                          <div className="trace-main">
                            <span className="trace-step">{event.step}</span>
                            <span className="trace-meta">
                              {event.status} · {event.provider ?? "system"} · {event.durationMs}ms
                            </span>
                          </div>
                          {event.outputSummary ? <div className="small-note">{event.outputSummary}</div> : null}
                          {event.errorMessage ? <div className="small-note">{event.errorMessage}</div> : null}
                        </div>
                      ))
                    ) : (
                      <div className="small-note">Send a turn to inspect the agent workflow.</div>
                    )}
                  </div>
                ) : null}
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
                {reportError ? <p className="small-note">{reportError}</p> : null}
                <button className="primary-button" disabled={isReporting} onClick={finishSession} type="button">
                  {isReporting ? <Loader2 size={17} className="spin" /> : <Play size={17} />}
                  {isReporting ? "生成中" : "结束并生成报告"}
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
