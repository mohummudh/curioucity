import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { CameraCapture } from "./components/CameraCapture";
import { ChatPanel } from "./components/ChatPanel";
import { ParentGateModal } from "./components/ParentGateModal";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import type { AnalysisResult, Message, SessionToken } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try another photo.";
};

const randomId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));

const useAudioPlayback = () => {
  return (text: string, audioUrl?: string): void => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      void audio.play();
      return;
    }

    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.93;
      utterance.pitch = 1.08;
      utterance.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };
};

export default function App() {
  const [session, setSession] = useState<SessionToken | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Snap a photo to start.");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [parentGateOpen, setParentGateOpen] = useState(false);
  const [adminSnapshot, setAdminSnapshot] = useState<string>("");

  const transcriptRef = useRef<string>("");

  const playAudio = useAudioPlayback();
  const speech = useSpeechRecognition();
  const recorder = useAudioRecorder();

  useEffect(() => {
    void (async () => {
      try {
        const createdSession = await api.createSession();
        setSession(createdSession);
      } catch (error) {
        setErrorText(formatError(error));
      }
    })();
  }, []);

  useEffect(() => {
    const transcript = speech.transcript.trim();
    if (!transcript || transcript === transcriptRef.current) {
      return;
    }

    transcriptRef.current = transcript;
    void handleSendQuestion(transcript);
    speech.clearTranscript();
  }, [speech.transcript]);

  useEffect(() => {
    if (!recorder.recordedBlob || !session) {
      return;
    }
    const recordedBlob = recorder.recordedBlob;

    void (async () => {
      try {
        const transcript = await api.transcribeAudio(session, recordedBlob);
        if (transcript.trim()) {
          await handleSendQuestion(transcript.trim());
        }
      } catch (error) {
        setErrorText(formatError(error));
      } finally {
        recorder.clear();
      }
    })();
  }, [recorder.recordedBlob, session]);

  const startAnalysis = async (): Promise<void> => {
    if (!session || !file) {
      return;
    }

    try {
      setBusy(true);
      setErrorText(null);
      setStatusText("Who am I? Looking closely at your photo...");
      setAnalysis(null);
      setConversationId(null);
      setSuggestions([]);
      setMessages([]);

      const target = await api.createUploadTarget(session);
      await api.uploadImage(target.uploadUrl, file);

      setStatusText("Investigating cool facts super fast...");
      const started = await api.startAnalysis(session, target.imageUrl);

      let last: AnalysisResult | null = null;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await sleep(1000);
        const next = await api.getAnalysis(session, started.analysisId);
        last = next;

        if (next.status === "processing") {
          setStatusText("Building a voice and story hook...");
        }

        if (next.status === "ready" || next.status === "failed") {
          break;
        }
      }

      if (!last) {
        throw new Error("Analysis timed out");
      }

      if (last.status === "failed") {
        throw new Error(last.error ?? "Analysis failed");
      }

      if (last.status !== "ready") {
        throw new Error(last.error ?? "Analysis took too long. Please try another photo.");
      }

      setAnalysis(last);
      setConversationId(last.conversationId ?? null);

      const firstMessage: Message = {
        id: randomId(),
        role: "object",
        text: last.firstReplyText ?? "I'm ready to explore with you!",
        audioUrl: last.firstReplyAudioStreamUrl,
      };

      setMessages([firstMessage]);
      setStatusText("Ask a question or press Mic to keep exploring.");
      playAudio(firstMessage.text, firstMessage.audioUrl);
    } catch (error) {
      setErrorText(formatError(error));
      setStatusText("Try another photo.");
    } finally {
      setBusy(false);
    }
  };

  const handleSendQuestion = async (text: string): Promise<void> => {
    if (!session || !conversationId || !text.trim()) {
      return;
    }

    try {
      setBusy(true);
      setErrorText(null);
      const childMessage: Message = { id: randomId(), role: "child", text: text.trim() };
      setMessages((prev) => [...prev, childMessage]);

      const turn = await api.chatTurn({
        session,
        conversationId,
        text: text.trim(),
      });

      const objectMessage: Message = {
        id: turn.turnId,
        role: "object",
        text: turn.replyText,
        audioUrl: turn.replyAudioStreamUrl,
      };

      setMessages((prev) => [...prev, objectMessage]);
      setSuggestions(turn.followupSuggestions);
      playAudio(objectMessage.text, objectMessage.audioUrl);
    } catch (error) {
      setErrorText(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleMicPress = () => {
    if (speech.supported) {
      if (speech.listening) {
        speech.stopListening();
        return;
      }

      speech.startListening();
      return;
    }

    if (!recorder.supported) {
      setErrorText("Microphone is not available in this browser.");
      return;
    }

    if (recorder.recording) {
      recorder.stop();
      return;
    }

    void recorder.start();
  };

  const unlockParentArea = async (adminKey: string) => {
    try {
      const snapshot = await api.getAdminSnapshot(adminKey);
      setAdminSnapshot(JSON.stringify(snapshot, null, 2));
    } catch {
      setAdminSnapshot("Unable to load admin snapshot. Check admin key.");
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>WonderTalk</h1>
          <p>Take a photo. Hear it tell its story.</p>
        </div>
        <button type="button" className="parent-btn" onClick={() => setParentGateOpen(true)}>
          Parent
        </button>
      </header>

      <main className="content-grid">
        <CameraCapture file={file} busy={busy} onFileSelected={setFile} />

        <section className="status-card">
          <h2>Discovery Status</h2>
          <p className="status-text">{statusText}</p>

          {analysis?.entity ? (
            <div className="entity-pill">
              <strong>{analysis.entity.label}</strong>
              <span>{Math.round(analysis.entity.confidence * 100)}% match</span>
            </div>
          ) : null}

          <button type="button" disabled={!file || busy || !session} className="cta" onClick={() => void startAnalysis()}>
            {busy ? "Discovering..." : "Bring It to Life"}
          </button>

          {speech.error ? <p className="error-text">{speech.error}</p> : null}
          {recorder.error ? <p className="error-text">{recorder.error}</p> : null}
          {errorText ? <p className="error-text">{errorText}</p> : null}
        </section>

        <ChatPanel
          messages={messages}
          suggestions={suggestions}
          loading={busy}
          onSend={handleSendQuestion}
          onSuggestion={handleSendQuestion}
          onMicPress={handleMicPress}
          listening={speech.listening || recorder.recording}
          speechSupported={speech.supported || recorder.supported}
        />
      </main>

      {adminSnapshot ? (
        <section className="admin-snapshot">
          <h2>Admin Snapshot</h2>
          <pre>{adminSnapshot}</pre>
        </section>
      ) : null}

      <ParentGateModal
        open={parentGateOpen}
        onClose={() => setParentGateOpen(false)}
        onUnlocked={(key) => void unlockParentArea(key)}
      />
    </div>
  );
}
