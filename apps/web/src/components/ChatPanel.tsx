import { FormEvent, useState } from "react";
import type { Message } from "../types";

type ChatPanelProps = {
  messages: Message[];
  suggestions: string[];
  loading: boolean;
  onSend: (text: string) => Promise<void>;
  onSuggestion: (text: string) => Promise<void>;
  onMicPress: () => void;
  listening: boolean;
  speechSupported: boolean;
};

export const ChatPanel = ({
  messages,
  suggestions,
  loading,
  onSend,
  onSuggestion,
  onMicPress,
  listening,
  speechSupported,
}: ChatPanelProps) => {
  const [value, setValue] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) {
      return;
    }

    setValue("");
    await onSend(trimmed);
  };

  return (
    <section className="chat-card">
      <h2>Talk to Me</h2>

      <div className="messages" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <p>{message.text}</p>
            {message.audioUrl ? (
              <audio controls preload="none">
                <source src={message.audioUrl} />
              </audio>
            ) : null}
          </article>
        ))}
      </div>

      {suggestions.length > 0 ? (
        <div className="suggestions">
          {suggestions.slice(0, 3).map((suggestion) => (
            <button key={suggestion} disabled={loading} type="button" onClick={() => onSuggestion(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask your object a question..."
          maxLength={240}
        />
        <button disabled={loading || !value.trim()} type="submit">
          Send
        </button>
        <button type="button" className="mic" onClick={onMicPress} disabled={loading || !speechSupported}>
          {listening ? "Stop" : "Mic"}
        </button>
      </form>
    </section>
  );
};
