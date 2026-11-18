import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MODELS, png, planNumber, planSource, roomName, type Earlier, type Match, type SearchResult } from "../api";
import { RoomMap } from "./RoomMap";

interface Props {
  result: SearchResult;
  uploadedUrl: string;
  earlier: Earlier[] | null;
  onOpen: (id: string) => void;
  focusRoom: string | null;
  setFocusRoom: (room: string | null) => void;
  hoverRank: number | null;
  setHoverRank: (rank: number | null) => void;
  selectedRank: number | null;
  setSelectedRank: (rank: number | null) => void;
}

// The five closest homes, each on its own sheet: the plan as drawn, its rooms from the annotations, rank and distance
export function Result({ result, uploadedUrl, earlier, onOpen, focusRoom, setFocusRoom, hoverRank, setHoverRank, selectedRank, setSelectedRank }: Props) {
  const selected = result.matches.find((m) => m.rank === selectedRank) ?? null;
  const model = MODELS[result.model] ?? MODELS.v3;
  // searches saved before the network tabs only have the v3 room map
  const queryPng = result.query_png_base64 ?? result.rooms_png_base64;
  const queryKind = result.query_kind ?? "rooms";

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-head">
        <h2 id="results-title">Five closest homes</h2>
        <p className="muted">
          Out of the 5,000 plans of CubiCasa5K, by {result.model} · {model.name.toLowerCase()}. Smaller distance = more similar.
        </p>
      </div>

      <RoomKey colours={result.room_colours} focus={focusRoom} setFocus={setFocusRoom} />

      <ol className="sheets">
        <li className="sheet match yours" style={{ "--i": 0 } as CSSProperties}>
          <img className="upload-image" src={uploadedUrl} alt="Your plan as uploaded" />
          {queryPng && queryKind === "rooms" ? (
            <RoomMap src={png(queryPng)} colours={result.room_colours} focus={focusRoom} label={model.output} />
          ) : queryPng ? (
            <img className="pixel" src={png(queryPng)} alt={model.output} />
          ) : null}
          <div className="facts">
            <span className="rank">You</span>
            <span className="muted">{queryKind === "rooms" ? `rooms seen by ${result.model}` : `redrawn by ${result.model}`}</span>
          </div>
        </li>
        {result.matches.map((match) => (
          <li
            key={match.id}
            className="sheet match"
            style={{ "--i": match.rank } as CSSProperties}
            data-hover={hoverRank === match.rank || undefined}
            data-selected={selectedRank === match.rank || undefined}
            onMouseEnter={() => setHoverRank(match.rank)}
            onMouseLeave={() => setHoverRank(null)}
          >
            <img className="pixel" src={png(match.image_png_base64)} alt={`Plan ${planNumber(match.id)} as drawn`} />
            {match.rooms_png_base64 ? (
              <RoomMap
                src={png(match.rooms_png_base64)}
                colours={result.room_colours}
                focus={focusRoom}
                label={`Rooms of plan ${planNumber(match.id)}, from the annotations`}
              />
            ) : (
              <p className="no-rooms">No room annotation</p>
            )}
            <div className="facts">
              <span className="rank" aria-label={`Rank ${match.rank}`}>{match.rank}</span>
              <button
                type="button"
                className="link"
                aria-expanded={selectedRank === match.rank}
                onClick={() => setSelectedRank(selectedRank === match.rank ? null : match.rank)}
                onFocus={() => setHoverRank(match.rank)}
                onBlur={() => setHoverRank(null)}
              >
                Plan {planNumber(match.id)}
              </button>
              <span className="distance">{match.distance.toFixed(1)}</span>
            </div>
          </li>
        ))}
      </ol>

      {earlier && earlier.length > 0 && (
        <p className="earlier">
          <span className="muted">Earlier uploads closest to this one, from the codes saved in D1:</span>
          {earlier.map((other) => (
            <button key={other.id} type="button" className="link" onClick={() => onOpen(other.id)}>
              {other.file_name ?? "unnamed"}, {new Date(other.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {other.distance.toFixed(1)}
            </button>
          ))}
        </p>
      )}

      {selected && (
        <Detail
          match={selected}
          result={result}
          uploadedUrl={uploadedUrl}
          focusRoom={focusRoom}
          step={(by) => setSelectedRank(((selected.rank - 1 + by + 5) % 5) + 1)}
          close={() => setSelectedRank(null)}
        />
      )}
    </section>
  );
}

// The signature of the page: choose a room type and it is the only one left on every room map
export function RoomKey({ colours, focus, setFocus }: {
  colours: Record<string, string>;
  focus: string | null;
  setFocus: (room: string | null) => void;
}) {
  return (
    <div className="room-key" role="group" aria-label="Room key: choose a room type to isolate it on every room map">
      {Object.entries(colours).map(([room, colour]) => (
        <button
          key={room}
          type="button"
          className="chip"
          aria-pressed={focus === room}
          onClick={() => setFocus(focus === room ? null : room)}
        >
          <span className="swatch" style={{ background: colour }} aria-hidden="true" />
          {roomName(room)}
        </button>
      ))}
    </div>
  );
}

function Detail({ match, result, uploadedUrl, focusRoom, step, close }: {
  match: Match;
  result: SearchResult;
  uploadedUrl: string;
  focusRoom: string | null;
  step: (by: number) => void;
  close: () => void;
}) {
  return (
    <div
      className="sheet detail"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(-1);
        if (event.key === "ArrowRight") step(1);
        if (event.key === "Escape") close();
      }}
    >
      <div className="detail-images">
        <Trace match={match} uploadedUrl={uploadedUrl} />
        <figure>
          {match.rooms_png_base64 ? (
            <RoomMap
              src={png(match.rooms_png_base64)}
              colours={result.room_colours}
              focus={focusRoom}
              label={`Rooms of plan ${planNumber(match.id)}, from the annotations`}
            />
          ) : (
            <p className="no-rooms">No room annotation</p>
          )}
          <figcaption>Rooms, from the CubiCasa5K annotations</figcaption>
        </figure>
      </div>
      <dl className="detail-facts">
        <div><dt>Rank</dt><dd className="course">{match.rank} of 5</dd></div>
        <div><dt>Plan</dt><dd>{planNumber(match.id)}</dd></div>
        <div><dt>Folder</dt><dd>{planSource(match.id)}</dd></div>
        <div><dt>Distance</dt><dd>{match.distance.toFixed(2)}</dd></div>
      </dl>
      <div className="detail-nav">
        <button type="button" className="quiet" onClick={() => step(-1)}>Previous</button>
        <button type="button" className="quiet" onClick={() => step(1)}>Next</button>
        <button type="button" className="quiet" onClick={close}>Close</button>
      </div>
    </div>
  );
}

// Your plan laid over the match like tracing paper: its lines in red, as see-through as the slider says.
// Both are framed the way the server frames a plan before the network reads it: centred in a square.
function Trace({ match, uploadedUrl }: { match: Match; uploadedUrl: string }) {
  const [amount, setAmount] = useState(60);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const c = canvas.current;
      if (!c) return;
      const size = 384;
      c.width = size;
      c.height = size;
      const context = c.getContext("2d", { willReadFrequently: true })!;
      const f = Math.min(size / image.width, size / image.height);
      context.drawImage(image, (size - image.width * f) / 2, (size - image.height * f) / 2, image.width * f, image.height * f);
      const pixels = context.getImageData(0, 0, size, size);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const ink = 255 - (data[i] + data[i + 1] + data[i + 2]) / 3; // dark lines become red, paper becomes clear
        data[i] = 201;
        data[i + 1] = 59;
        data[i + 2] = 27;
        data[i + 3] = Math.min(255, Math.max(0, (ink - 25) * 1.6)) * (data[i + 3] / 255);
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = uploadedUrl;
  }, [uploadedUrl]);

  return (
    <figure className="trace">
      <div className="trace-stack">
        <img className="pixel" src={png(match.image_png_base64)} alt={`Plan ${planNumber(match.id)} as drawn`} />
        <canvas ref={canvas} style={{ opacity: amount / 100 }} aria-hidden="true" />
      </div>
      <label className="trace-control">
        Your plan on top
        <input type="range" min={0} max={100} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        <span>{amount}%</span>
      </label>
      <figcaption>Plan {planNumber(match.id)} as drawn, with your plan in red over it, like tracing paper</figcaption>
    </figure>
  );
}
