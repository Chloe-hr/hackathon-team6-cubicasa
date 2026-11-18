// The versions of the model the user can choose; the server on Render knows the same names
const MODELS = ["v1", "v2", "v3"];

// POST /api/search with a form field "plan" (an image file) and "model" (v1, v2 or v3):
// 1. send it to our model server, 2. store the plan and the full answer in R2,
// 3. store one row in D1, 4. answer the page.

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const file = form.get("plan");
  if (!file || typeof file === "string") {
    return Response.json({ error: "Send a floor-plan image in the field 'plan'." }, { status: 400 });
  }
  if (!(file.type || "").startsWith("image/")) {
    return Response.json({ error: "Send an image (PNG or JPEG)." }, { status: 415 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Image too large (max 5 MB)." }, { status: 413 });
  }
  const model = form.get("model") || "v3";
  if (!MODELS.includes(model)) {
    return Response.json({ error: `Unknown model: choose one of ${MODELS.join(", ")}.` }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());

  // 1. Ask the model server for the five most similar plans, with the chosen version
  let result;
  try {
    result = await callModel(env, toBase64(bytes), model);
  } catch (err) {
    // The most common reason: the free Render server was asleep and is still starting.
    // "waking: true" tells the page to say so and to try again by itself.
    return Response.json(
      { waking: true, error: "The model is waking up, about one minute.", detail: String(err) },
      { status: 503 },
    );
  }
  if (!Array.isArray(result.matches) || result.matches.length === 0) {
    return Response.json({ error: "The model server answered without matches." }, { status: 502 });
  }

  // 2. Store the uploaded plan and the whole answer (with the match images) in R2
  const id = crypto.randomUUID();
  const imageKey = `uploads/${id}`;
  const resultKey = `results/${id}.json`;
  await env.BUCKET.put(imageKey, bytes, { httpMetadata: { contentType: file.type } });
  await env.BUCKET.put(resultKey, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } });

  // 3. Store one row in D1. The "?" placeholders keep user input out of the SQL text
  const createdAt = new Date().toISOString();
  const best = result.matches[0];
  const [atlasX, atlasY] = result.atlas_xy || [null, null];   // v1 has no atlas: both stay empty
  await env.DB.prepare(
    `INSERT INTO searches (id, created_at, file_name, image_key, result_key, best_id, best_distance, match_ids, atlas_x, atlas_y, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, createdAt, file.name || null, imageKey, resultKey, best.id, best.distance,
          JSON.stringify(result.matches.map((m) => m.id)), atlasX, atlasY, model)
    .run();

  // 4. Answer the page
  return Response.json({ id, created_at: createdAt, file_name: file.name || null, ...result });
}

// Gradio's HTTP API has two steps: start a job, then read its result
async function callModel(env, imageBase64, model) {
  const base = `${env.MODEL_URL}/gradio_api/call/${env.MODEL_API_NAME}`;
  const started = await fetchWithTimeout(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [imageBase64, model] }),
  });
  if (!started.ok) throw new Error(`Model server answered ${started.status}`);
  const { event_id } = await started.json();

  const stream = await fetchWithTimeout(`${base}/${event_id}`);
  const text = await stream.text(); // "event: complete\ndata: [ {...} ]"
  const complete = text.split("event: complete")[1];
  if (!complete) throw new Error(`No result from the model server: ${text.slice(0, 200)}`);
  const data = JSON.parse(complete.split("data:")[1].trim());
  return data[0];
}

async function fetchWithTimeout(url, options = {}, ms = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
