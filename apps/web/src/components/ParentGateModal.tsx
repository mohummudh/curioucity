import { useMemo, useState } from "react";

type ParentGateModalProps = {
  open: boolean;
  onClose: () => void;
  onUnlocked: (adminKey: string) => void;
};

export const ParentGateModal = ({ open, onClose, onUnlocked }: ParentGateModalProps) => {
  const challenge = useMemo(() => {
    const a = Math.floor(Math.random() * 6) + 6;
    const b = Math.floor(Math.random() * 4) + 2;
    return {
      text: `${a} + ${b}`,
      answer: String(a + b),
    };
  }, [open]);

  const [answer, setAnswer] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h3>Parent Gate</h3>
        <p>Adults only: solve this quick math check.</p>

        <label>
          {challenge.text} =
          <input value={answer} onChange={(event) => setAnswer(event.target.value)} inputMode="numeric" />
        </label>

        <label>
          Admin key
          <input
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="parent-mode"
            autoCapitalize="off"
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="modal-actions">
          <button
            type="button"
            onClick={() => {
              if (answer.trim() !== challenge.answer) {
                setError("Math check failed.");
                return;
              }
              onUnlocked(adminKey.trim() || "parent-mode");
              onClose();
            }}
          >
            Unlock
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
