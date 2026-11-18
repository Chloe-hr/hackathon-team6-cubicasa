import { MODELS, type Atlas as AtlasData, type Explain, type SearchResult } from "../api";
import { Atlas } from "./Atlas";
import { Distances } from "./Distances";
import { Layers } from "./Layers";
import { useReveal } from "../reveal";

interface Props {
  result: SearchResult;
  uploadedUrl: string;
  explain: Explain | null;
  explainError: string | null;
  retryExplain: () => void;
  atlas: AtlasData | null;
  hoverRank: number | null;
  setHoverRank: (rank: number | null) => void;
  focusRoom: string | null;
}

// What the network computed for this search: where the plan lands, how close the five are, what each layer sees
export function LookInside({ result, uploadedUrl, explain, explainError, retryExplain, atlas, hoverRank, setHoverRank, focusRoom }: Props) {
  const model = result.model;
  const mapSheet = useReveal<HTMLElement>();
  const distanceSheet = useReveal<HTMLElement>();
  const layerSheet = useReveal<HTMLElement>();
  const waiting = !explain && !explainError;

  return (
    <section className="inside" aria-labelledby="inside-title" aria-busy={waiting}>
      <div className="inside-head">
        <h2 id="inside-title">Look inside {model} · {MODELS[model].name.toLowerCase()}</h2>
        <p className="muted">Computed for your plan by the same ONNX file the server runs. Nothing here is drawn by hand.</p>
        {explainError && (
          <p className="status" data-tone="error">
            {explainError} <button type="button" className="link" onClick={retryExplain}>Try again</button>
          </p>
        )}
      </div>

      <div className="inside-grid">
        <section className="sheet figure-sheet" aria-labelledby="map-title" ref={mapSheet}>
          <h3 id="map-title">Where your plan lands among the 5,000</h3>
          {atlas ? (
            <Atlas atlas={atlas} model={model} distances={explain?.distances ?? null} matches={result.matches}
              uploadedUrl={uploadedUrl} hoverRank={hoverRank} setHoverRank={setHoverRank} introKey={result.id} initialMode="dots"
              focusRoom={focusRoom} colours={result.room_colours}
              label={`Map of the 5,000 plans for ${model}, with your plan and its five matches`} />
          ) : (
            <div className="skeleton square" />
          )}
          <p className="reading">
            Each dot is one of the 5,000 plans, placed by UMAP from this network's codes. Darker dots are closer to your
            plan, rings are the five matches; in the Plans view, paler drawings are farther. The map was computed once
            for the collection, so your plan sits at the middle of its matches. UMAP keeps neighbours together but bends
            long distances: trust the shade more than the gap.
            {model === "v1" && " The v1 map was computed for this app with the same UMAP settings as v2 and v3."}
          </p>
        </section>

        <section className="sheet figure-sheet" aria-labelledby="distance-title" ref={distanceSheet}>
          <h3 id="distance-title">How close the five are</h3>
          {explain ? <Distances distances={explain.distances} matches={result.matches} hoverRank={hoverRank} /> : <div className="skeleton chart" />}
        </section>
      </div>

      <section className="sheet figure-sheet" aria-labelledby="layers-title" ref={layerSheet}>
        <h3 id="layers-title">What each layer sees</h3>
        {explain ? <Layers steps={explain.steps} /> : <div className="skeleton strip" />}
        <p className="reading">
          The encoder halves your plan four times, 128 → 64 → 32 → 16 → 8 px, and squeezes it into 128 numbers; the
          decoder draws it again from those numbers alone. Each tile is one of the four most active channels of its layer
          for your plan, at the layer's real resolution, dark = strong; sizes are channels × height × width.
          {model === "v3"
            ? " The output has 12 channels, 11 room types and the walls; “how sure” is the probability of the room type it chose."
            : " The output is the plan redrawn from the code."}
          {explain && ` ${explain.total_weights.toLocaleString("en")} weights in total.`}
        </p>
      </section>
    </section>
  );
}
