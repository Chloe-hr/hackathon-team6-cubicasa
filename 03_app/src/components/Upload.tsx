import { useEffect, useState } from "react";
import { MODELS, type Model } from "../api";

const EXAMPLES = ["1191", "1966", "435", "20022"];

interface Props {
  model: Model;
  setModel: (model: Model) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  onSearch: () => void;
  busy: boolean;
  status: { text: string; tone: "info" | "waking" | "error" } | null;
}

// Left sheet: choose the network, choose a plan, search
export function Upload({ model, setModel, file, setFile, onSearch, busy, status }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function pickExample(number: string) {
    const name = `plan_high_quality_architectural_${number}.png`;
    const blob = await (await fetch(`/examples/${name}`)).blob();
    setFile(new File([blob], name, { type: "image/png" }));
  }

  return (
    <form
      className="sheet upload"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <h2>Your plan</h2>

      <fieldset className="networks">
        <legend>Network</legend>
        {(Object.keys(MODELS) as Model[]).map((key) => (
          <label key={key} className="network">
            <input type="radio" name="model" value={key} checked={model === key} onChange={() => setModel(key)} />
            <span className="network-name">
              {key} · {MODELS[key].name}
              {key === "v3" && <span className="tag">Recommended</span>}
            </span>
            <span className="network-about">{MODELS[key].about}</span>
          </label>
        ))}
      </fieldset>

      <label
        className="drop"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files[0];
          if (dropped) setFile(dropped);
        }}
      >
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="visually-hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {preview ? (
          <img src={preview} alt="The plan you chose" />
        ) : (
          <span className="drop-hint">
            <b>Choose a floor plan</b>
            <span>or drop it here · PNG or JPEG, up to 5 MB</span>
          </span>
        )}
      </label>
      {file && <p className="file-name">{file.name}</p>}

      <p className="examples">
        Or a plan from the collection, which should find itself first:{" "}
        {EXAMPLES.map((number, i) => (
          <span key={number}>
            <button type="button" className="link" onClick={() => pickExample(number)}>{number}</button>
            {i < EXAMPLES.length - 1 ? ", " : ""}
          </span>
        ))}
      </p>

      <button type="submit" className="primary" disabled={!file || busy}>
        {busy ? "Searching…" : "Find similar plans"}
      </button>
      <p className="status" data-tone={status?.tone} role="status" aria-live="polite">
        {status?.text}
      </p>
    </form>
  );
}
