import { useCallback, useRef, useState } from "react";

export type UseAudioRecorderResult = {
  supported: boolean;
  recording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  recordedBlob: Blob | null;
  clear: () => void;
};

export const useAudioRecorder = (): UseAudioRecorderResult => {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported = typeof window !== "undefined" && Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);

  const start = useCallback(async () => {
    if (!supported) {
      setError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined,
      });

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecordedBlob(blob);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setError(null);
      setRecordedBlob(null);
      setRecording(true);
    } catch {
      setError("Microphone permission was denied or unavailable.");
    }
  }, [supported]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const clear = useCallback(() => {
    setRecordedBlob(null);
  }, []);

  return {
    supported,
    recording,
    error,
    start,
    stop,
    recordedBlob,
    clear,
  };
};
