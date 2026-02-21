import { useCallback, useMemo, useRef, useState } from "react";

type RecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionResultEvent = Event & {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
    };
    length: number;
  };
};

export type UseSpeechRecognitionResult = {
  supported: boolean;
  listening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  clearTranscript: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

export const useSpeechRecognition = (): UseSpeechRecognitionResult => {
  const recognitionRef = useRef<InstanceType<RecognitionConstructor> | null>(null);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Recognition = useMemo(
    () => (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null) as RecognitionConstructor | null,
    [],
  );

  const startListening = useCallback(() => {
    if (!Recognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const chunks: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        chunks.push(event.results[i][0].transcript);
      }
      setTranscript(chunks.join(" ").trim());
    };

    recognition.onerror = () => {
      setError("I couldn't hear clearly. Try again in a quieter space.");
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }, [Recognition]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    supported: Boolean(Recognition),
    listening,
    transcript,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
};
