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
  Trash2,
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

type SavedSession = {
  version: 1;
  id: string;
  title: string;
  savedAt: string;
  updatedAt: string;
  scenarioId: ScenarioId;
  turns: Turn[];
  feedback: Feedback | null;
  report: Report | null;
  pronunciationNote: string;
  sessionId: string;
  agentTrace: TraceEvent[];
};

const SESSION_STORAGE_KEY = "potatomato-speaking-coach-session";
const SESSION_HISTORY_STORAGE_KEY = "potatomato-speaking-coach-history";
const MAX_SAVED_SESSIONS = 20;

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const makeTurn = (speaker: Turn["speaker"], text: string): Turn => ({
  id: createClientId(),
  speaker,
  text,
  createdAt: new Date().toISOString()
});

function createClientId() {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadSavedSession(): SavedSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    return normalizeSavedSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function loadSavedSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(SESSION_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeSavedSession(item))
      .filter((item): item is SavedSession => Boolean(item))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, MAX_SAVED_SESSIONS);
  } catch {
    return [];
  }
}

function saveCurrentSession(input: Omit<SavedSession, "version" | "id" | "savedAt" | "updatedAt" | "title"> & { id?: string }) {
  if (typeof window === "undefined") return;

  const now = new Date().toISOString();
  const payload: SavedSession = {
    version: 1,
    id: input.id || createClientId(),
    title: buildSessionTitle(input.scenarioId, input.turns),
    savedAt: now,
    updatedAt: now,
    ...input
  };
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  upsertSavedSession(payload);
  return payload;
}

function clearSavedSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function clearAllSavedSessions() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(SESSION_HISTORY_STORAGE_KEY);
}

function removeSavedSession(id: string) {
  if (typeof window === "undefined") return;
  const nextSessions = loadSavedSessions().filter((item) => item.id !== id);
  window.localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(nextSessions));
  const current = loadSavedSession();
  if (current?.id === id) window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function upsertSavedSession(session: SavedSession) {
  const sessions = loadSavedSessions();
  const nextSessions = [
    session,
    ...sessions.filter((item) => item.id !== session.id)
  ].slice(0, MAX_SAVED_SESSIONS);
  window.localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(nextSessions));
}

function normalizeSavedSession(value: unknown): SavedSession | null {
  const parsed = value as Partial<SavedSession>;
  if (!parsed || parsed.version !== 1) return null;
  if (!parsed.scenarioId || !scenarios.some((item) => item.id === parsed.scenarioId)) return null;
  if (!Array.isArray(parsed.turns)) return null;

  const now = new Date().toISOString();
  const id = typeof parsed.id === "string" && parsed.id ? parsed.id : createClientId();
  const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : now;
  const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : savedAt;

  return {
    version: 1,
    id,
    title: typeof parsed.title === "string" && parsed.title ? parsed.title : buildSessionTitle(parsed.scenarioId, parsed.turns),
    savedAt,
    updatedAt,
    scenarioId: parsed.scenarioId,
    turns: parsed.turns,
    feedback: parsed.feedback ?? null,
    report: parsed.report ?? null,
    pronunciationNote: parsed.pronunciationNote ?? "",
    sessionId: parsed.sessionId ?? "",
    agentTrace: Array.isArray(parsed.agentTrace) ? parsed.agentTrace : []
  };
}

function buildSessionTitle(scenarioId: ScenarioId, turns: Turn[]) {
  const scenario = getScenario(scenarioId);
  const firstUserText = turns.find((turn) => turn.speaker === "user")?.text.trim();
  if (!firstUserText) return `${scenario.name} · 新练习`;
  return `${scenario.name} · ${firstUserText.slice(0, 28)}${firstUserText.length > 28 ? "..." : ""}`;
}
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
  const [recordingNote, setRecordingNote] = useState("");
  const [connectionMode, setConnectionMode] = useState("Demo mode");
  const [sessionId, setSessionId] = useState("");
  const [showTrace, setShowTrace] = useState(false);
  const [agentTrace, setAgentTrace] = useState<TraceEvent[]>([]);
  const [isArchiveLoaded, setIsArchiveLoaded] = useState(false);
  const [archiveNote, setArchiveNote] = useState("");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [activeArchiveId, setActiveArchiveId] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const latestAudioRef = useRef<Blob | null>(null);
  const draftRef = useRef("");
  const pendingVoiceSubmitRef = useRef(false);
  const skipScenarioResetRef = useRef(false);
  const activeArchiveIdRef = useRef("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const saved = loadSavedSession();
    skipScenarioResetRef.current = true;
    setSavedSessions(loadSavedSessions());
    if (saved) {
      activeArchiveIdRef.current = saved.id;
      setActiveArchiveId(saved.id);
      setScenarioId(saved.scenarioId);
      setTurns(saved.turns.length ? saved.turns : [makeTurn("ai", getScenario(saved.scenarioId).firstLine)]);
      setFeedback(saved.feedback);
      setReport(saved.report);
      setPronunciationNote(saved.pronunciationNote);
      setSessionId(saved.sessionId);
      setAgentTrace(saved.agentTrace);
      setArchiveNote(`Restored saved session from ${new Date(saved.savedAt).toLocaleString()}.`);
    } else {
      const id = createClientId();
      activeArchiveIdRef.current = id;
      setActiveArchiveId(id);
      setTurns([makeTurn("ai", scenario.firstLine)]);
      setArchiveNote("Started a new local session.");
    }
    setIsArchiveLoaded(true);
    latestAudioRef.current = null;
  }, []);

  useEffect(() => {
    if (!isArchiveLoaded) return;
    if (skipScenarioResetRef.current) {
      skipScenarioResetRef.current = false;
      return;
    }
    setTurns([makeTurn("ai", scenario.firstLine)]);
    setFeedback(null);
    setReport(null);
    setReportError("");
    setDraft("");
    setPronunciationNote("");
    setRecordingNote("");
    setSessionId("");
    setAgentTrace([]);
    setShowTrace(false);
    const id = createClientId();
    activeArchiveIdRef.current = id;
    setActiveArchiveId(id);
    latestAudioRef.current = null;
    setArchiveNote("Started a new scenario and saved it locally.");
  }, [scenario, isArchiveLoaded]);

  useEffect(() => {
    if (!isArchiveLoaded) return;
    const saved = saveCurrentSession({
      id: activeArchiveIdRef.current || activeArchiveId,
      scenarioId,
      turns,
      feedback,
      report,
      pronunciationNote,
      sessionId,
      agentTrace
    });
    if (saved) {
      activeArchiveIdRef.current = saved.id;
      if (activeArchiveId !== saved.id) setActiveArchiveId(saved.id);
      setSavedSessions(loadSavedSessions());
    }
  }, [isArchiveLoaded, scenarioId, turns, feedback, report, pronunciationNote, sessionId, agentTrace, activeArchiveId]);

  async function probeRealtime() {
    const response = await fetch("/api/realtime/session", { method: "POST" });
    const data = await response.json();
    setConnectionMode(data.mode === "realtime" ? "Realtime configured" : "Demo mode");
  }

  useEffect(() => {
    probeRealtime().catch(() => setConnectionMode("Demo mode"));
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
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      throw new Error("Microphone requires localhost/127.0.0.1 or HTTPS.");
    }
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      throw new Error("This browser does not support recording. Please use Chrome or Edge.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunksRef.current = [];
    latestAudioRef.current = null;
    setRecordingNote("Recording... click Stop when you finish speaking. The answer will submit automatically.");

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      latestAudioRef.current = audio;
      stream.getTracks().forEach((track) => track.stop());

      if (!audio.size) {
        setRecordingNote("No valid audio was captured. Please check microphone permission and try again.");
        return;
      }

      setRecordingNote("Audio saved. Sending audio and transcript to AI.");
      if (pendingVoiceSubmitRef.current) {
        pendingVoiceSubmitRef.current = false;
        void submitVoiceTurn(audio);
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
  }

  async function startListening() {
    if (isThinking || isListening) return;
    try {
      await startAudioCapture();
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法录制音频，请检查麦克风权限后重试。";
      setPronunciationNote(message);
      setRecordingNote(message);
      return;
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      pendingVoiceSubmitRef.current = true;
      recognitionRef.current = null;
      setIsListening(true);
      setRecordingNote("");
      return;
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
      const nextText = (finalText || interimText).trim();
      draftRef.current = nextText;
      setDraft(nextText);
    };
    recognition.onend = () => {
      setIsListening(false);
      if (mediaRecorderRef.current?.state === "recording") {
        pendingVoiceSubmitRef.current = true;
        mediaRecorderRef.current.stop();
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      pendingVoiceSubmitRef.current = true;
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      setPronunciationNote("");
      setRecordingNote("");
    };
    recognitionRef.current = recognition;
    pendingVoiceSubmitRef.current = true;
    recognition.start();
    setIsListening(true);
  }

  function stopListening() {
    pendingVoiceSubmitRef.current = true;
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setIsListening(false);
  }

  async function submitVoiceTurn(audio: Blob) {
    const text = await resolveVoiceTranscript(audio, draftRef.current.trim());
    if (!text) {
      latestAudioRef.current = audio;
      setRecordingNote("");
      setPronunciationNote("");
      return;
    }

    draftRef.current = text;
    setDraft(text);
    await submitAgentTurn(text, audio);
  }

  async function resolveVoiceTranscript(audio: Blob, browserTranscript: string) {
    if (browserTranscript) return browserTranscript;

    setRecordingNote("");
    try {
      const form = new FormData();
      form.append("audio", audio, "answer.webm");
      form.append("language", "en_us");

      const response = await fetch("/api/asr", { method: "POST", body: form });
      const data = (await response.json()) as { transcript?: string; message?: string };
      const transcript = data.transcript?.trim() ?? "";
      if (transcript) {
        setRecordingNote("");
        return transcript;
      }

      setPronunciationNote("");
      return "";
    } catch {
      setPronunciationNote("");
      return "";
    }
  }
  async function submitAgentTurn(text: string, audio?: Blob) {
    if (!text || isThinking) return;

    const userTurn = makeTurn("user", text);
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setDraft("");
    draftRef.current = "";
    setFeedback(null);
    setReportError("");
    setIsThinking(true);
    setAgentTrace([]);
    setRecordingNote("");

    try {
      const form = new FormData();
      if (sessionId) form.append("sessionId", sessionId);
      form.append("scenarioId", scenarioId);
      form.append("turns", JSON.stringify(nextTurns));
      form.append("text", text);
      form.append("includeTrace", "true");
      if (audio) form.append("audio", audio, "answer.webm");
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
      setRecordingNote("");
      speak(data.aiTurn.text);
    } catch {
      setFeedback(null);
      setPronunciationNote("");
      setRecordingNote("");
      setIsThinking(false);
    }
  }
  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isThinking) return;
    await submitAgentTurn(text, latestAudioRef.current ?? undefined);
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
    const id = createClientId();
    activeArchiveIdRef.current = id;
    setActiveArchiveId(id);
    setTurns([makeTurn("ai", scenario.firstLine)]);
    setFeedback(null);
    setReport(null);
    setReportError("");
    setDraft("");
    setPronunciationNote("");
    setRecordingNote("");
    setSessionId("");
    setAgentTrace([]);
    setShowTrace(false);
    latestAudioRef.current = null;
    setArchiveNote("Session restarted and saved locally.");
  }

  function deleteArchive() {
    clearAllSavedSessions();
    const id = createClientId();
    activeArchiveIdRef.current = id;
    setActiveArchiveId(id);
    setSavedSessions([]);
    setTurns([makeTurn("ai", scenario.firstLine)]);
    setFeedback(null);
    setReport(null);
    setReportError("");
    setDraft("");
    setPronunciationNote("");
    setRecordingNote("");
    setSessionId("");
    setAgentTrace([]);
    setShowTrace(false);
    latestAudioRef.current = null;
    setArchiveNote("All local archives cleared. A fresh session is now active.");
  }

  function loadArchive(session: SavedSession) {
    skipScenarioResetRef.current = true;
    activeArchiveIdRef.current = session.id;
    setActiveArchiveId(session.id);
    setScenarioId(session.scenarioId);
    setTurns(session.turns.length ? session.turns : [makeTurn("ai", getScenario(session.scenarioId).firstLine)]);
    setFeedback(session.feedback);
    setReport(session.report);
    setReportError("");
    setDraft("");
    setPronunciationNote(session.pronunciationNote);
    setRecordingNote("");
    setSessionId(session.sessionId);
    setAgentTrace(session.agentTrace);
    setShowTrace(false);
    latestAudioRef.current = null;
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    setArchiveNote(`Loaded archive: ${session.title}`);
  }

  function deleteOneArchive(id: string) {
    removeSavedSession(id);
    const nextSessions = loadSavedSessions();
    setSavedSessions(nextSessions);
    if (activeArchiveId === id) {
      const next = nextSessions[0];
      if (next) {
        loadArchive(next);
      } else {
        resetSession();
      }
    } else {
      setArchiveNote("Archive deleted.");
    }
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
              <div className="feedback-label">历史存档</div>
              <div className="feedback-list">
                {savedSessions.length ? (
                  savedSessions.map((session) => (
                    <div className="feedback-item" key={session.id}>
                      <div className="feedback-label">{session.title}</div>
                      <p className="small-note">
                        {getScenario(session.scenarioId).name} · {session.turns.filter((turn) => turn.speaker === "user").length} 轮 · {new Date(session.updatedAt).toLocaleString()}
                      </p>
                      <div className="controls">
                        <button className="secondary-button" onClick={() => loadArchive(session)} type="button">
                          加载
                        </button>
                        <button className="secondary-button" onClick={() => deleteOneArchive(session.id)} type="button">
                          删除
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="small-note">暂无历史记录。开始练习后会自动保存。</div>
                )}
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
              <button className="secondary-button" onClick={deleteArchive} type="button">
                <Trash2 size={17} />
                清除存档
              </button>
            </div>
            {archiveNote ? <p className="small-note">{archiveNote}</p> : null}
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
            <div className="input-row">
              <input
                className="text-input"
                value={draft}
                readOnly
                placeholder="录音后这里会显示自动转写文本..."
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
                发送转写
              </button>
            </div>
          </form>
        </section>

        <aside className="panel right-panel">
          <div className="panel-header">
            <h2 className="panel-title">反馈与报告</h2>
            <p className="panel-subtitle">对话中轻量纠错，课后集中给训练建议。</p>
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

