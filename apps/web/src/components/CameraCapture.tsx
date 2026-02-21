import { useMemo } from "react";

type CameraCaptureProps = {
  file: File | null;
  busy: boolean;
  onFileSelected: (file: File) => void;
};

export const CameraCapture = ({ file, busy, onFileSelected }: CameraCaptureProps) => {
  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  return (
    <section className="capture-card">
      <div className="capture-header">
        <h2>Snap Something Amazing</h2>
        <p>Take a photo of anything and let it come alive.</p>
      </div>

      <label className={`capture-input ${busy ? "disabled" : ""}`}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          disabled={busy}
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) {
              onFileSelected(nextFile);
            }
          }}
        />
        <span>{busy ? "Working..." : "Open Camera or Gallery"}</span>
      </label>

      {previewUrl ? <img src={previewUrl} alt="preview" className="capture-preview" /> : null}
    </section>
  );
};
