// What the API (worker/index.ts) and the model server answer, and small helpers to call them

export type Model = "v1" | "v2" | "v3";

export const MODELS: Record<Model, { name: string; about: string; output: string }> = {
  v1: {
    name: "Plain autoencoder",
    about: "Compares the plans exactly as drawn. Faint scans and bold drawings end up apart even when the layout is the same.",
    output: "How the network redraws your plan",
  },
  v2: {
    name: "Cleaned lines",
    about: "Cleans every plan down to its thin lines first, so the drawing style counts less and the overall shape counts more.",
    output: "How the network redraws your plan, cleaned",
  },
  v3: {
    name: "Rooms",
    about: "Trained to recognise the rooms: matches tend to share the room layout, not only the outline.",
    output: "The rooms the network sees in your plan",
  },
};

export interface Match {
  rank: number;
  id: string;
  distance: number;
  image_png_base64: string;
  has_rooms: boolean;
  rooms_png_base64: string | null;
}

export interface SearchResult {
  id: string;
  created_at: string;
  file_name: string | null;
  model: Model;
  matches: Match[];
  query_kind?: "rooms" | "reconstruction";
  query_png_base64?: string;
  rooms_png_base64: string | null; // searches saved before the network tabs only have this one
  room_colours: Record<string, string>;
}

export interface Step {
  tensor: string;
  shape: number[];
  weights: number;
  ops: { op: string; kernel_shape?: number[]; strides?: number[] }[];
  tiles?: { channel?: number; name?: string; png: string }[];
  values?: number[];
}

export interface Explain {
  model_version: Model;
  total_weights: number;
  steps: Step[];
  distances: number[]; // to each of the 5,000 plans, in the order of atlas.json
}

export interface Atlas {
  ids: string[];
  tile: number; // the plan drawings: tile px, tiles per row and per sheet in /data/plans_<n>.webp
  cols: number;
  per_sheet: number;
  v1: number[];
  v2: number[];
  v3: number[];
}

export interface SavedSearch {
  id: string;
  created_at: string;
  file_name: string | null;
  best_id: string;
  best_distance: number;
  model: Model | null;
}

export interface Earlier {
  id: string;
  created_at: string;
  file_name: string | null;
  distance: number;
}

export const png = (b64: string) => `data:image/png;base64,${b64}`;
export const planNumber = (id: string) => id.split("/").pop() ?? id;
export const planSource = (id: string) => id.split("/")[0].replaceAll("_", " ");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly waking = false) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || response.statusText, response.status, Boolean(body.waking));
  return body as T;
}

// A free Render server sleeps after 15 minutes: when the API says it is waking, wait and ask again
export async function untilAwake<T>(call: () => Promise<T>, onWait: (attempt: number) => void, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof ApiError && err.waking) || attempt >= attempts) throw err;
      onWait(attempt);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

export const roomName = (name: string) => (name === "LivingRoom" ? "Living room" : name);
